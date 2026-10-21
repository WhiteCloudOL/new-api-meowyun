package billingexpr

import (
	"fmt"
	"math"

	"github.com/expr-lang/expr/ast"
)

type reservationRange struct{ low, high float64 }

// ReservationUpperBound bounds every output quantity from zero to the requested
// maximum. Evaluating only c=max is unsafe: a conditional or decreasing price
// can cost more at an intermediate output length. This does not change pricing
// or settlement. Unsupported/unbounded expressions fail closed before submission.
func ReservationUpperBound(expression, hash string, prompt, output float64, request RequestInput) (float64, error) {
	if prompt < 0 || output < 0 || math.IsNaN(prompt) || math.IsNaN(output) || math.IsInf(prompt, 0) || math.IsInf(output, 0) {
		return 0, fmt.Errorf("invalid reservation token bounds")
	}
	entry, err := compileEntryFromCacheByHash(expression, hash)
	if err != nil {
		return 0, err
	}
	bound, err := boundReservationCost(entry.reservationTree, prompt, output, request)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(bound.high) || math.IsInf(bound.high, 0) || bound.high < 0 {
		return 0, fmt.Errorf("billing expression has no finite non-negative reservation bound")
	}
	return bound.high, nil
}

func reservationDependsOnUsage(node ast.Node) bool {
	return ast.Find(node, func(node ast.Node) bool {
		identifier, ok := node.(*ast.IdentifierNode)
		if !ok {
			return false
		}
		switch identifier.Value {
		case "p", "c", "cr", "cc", "cc1h", "img", "img_cr", "img_o", "ai", "ao", "u", "hour", "minute", "weekday", "month", "day":
			return true
		}
		return false
	}) != nil
}

func boundReservationCost(node ast.Node, prompt, output float64, request RequestInput) (reservationRange, error) {
	switch n := node.(type) {
	case *ast.IntegerNode:
		return reservationRange{float64(n.Value), float64(n.Value)}, nil
	case *ast.FloatNode:
		return reservationRange{n.Value, n.Value}, nil
	case *ast.IdentifierNode:
		switch n.Value {
		case "len":
			return reservationRange{prompt, prompt}, nil
		case "p", "cr", "cc", "cc1h", "img", "img_cr", "ai":
			// Category counts are not known until the upstream replies. Allow
			// each category up to the full locally estimated input quantity.
			return reservationRange{0, prompt}, nil
		case "c", "img_o", "ao":
			return reservationRange{0, output}, nil
		case "image_count":
			count := 1
			if request.ImageCount != nil {
				count = *request.ImageCount
			}
			return reservationRange{float64(count), float64(count)}, nil
		}
	case *ast.UnaryNode:
		value, err := boundReservationCost(n.Node, prompt, output, request)
		if err != nil {
			return reservationRange{}, err
		}
		switch n.Operator {
		case "+":
			return value, nil
		case "-":
			return reservationRange{-value.high, -value.low}, nil
		}
	case *ast.ConditionalNode:
		if !reservationDependsOnUsage(n.Cond) {
			// Request probes and the estimated context length are fixed for
			// this request. Time probes are deliberately not treated as fixed.
			condition, _, err := RunExprWithRequest("("+n.Cond.String()+") ? 1.0 : 0.0", TokenParams{Len: prompt}, request)
			if err != nil {
				return reservationRange{}, err
			}
			branch := n.Exp2
			if condition == 1 {
				branch = n.Exp1
			}
			return boundReservationCost(branch, prompt, output, request)
		}
		left, err := boundReservationCost(n.Exp1, prompt, output, request)
		if err != nil {
			return reservationRange{}, err
		}
		right, err := boundReservationCost(n.Exp2, prompt, output, request)
		return reservationRange{min(left.low, right.low), max(left.high, right.high)}, err
	case *ast.BinaryNode:
		left, err := boundReservationCost(n.Left, prompt, output, request)
		if err != nil {
			return reservationRange{}, err
		}
		right, err := boundReservationCost(n.Right, prompt, output, request)
		if err != nil {
			return reservationRange{}, err
		}
		switch n.Operator {
		case "+":
			return reservationRange{left.low + right.low, left.high + right.high}, nil
		case "-":
			return reservationRange{left.low - right.high, left.high - right.low}, nil
		case "*", "/":
			if n.Operator == "/" {
				if right.low <= 0 && right.high >= 0 {
					return reservationRange{}, fmt.Errorf("billing reservation divisor can be zero")
				}
				right = reservationRange{1 / right.high, 1 / right.low}
			}
			products := []float64{left.low * right.low, left.low * right.high, left.high * right.low, left.high * right.high}
			result := reservationRange{products[0], products[0]}
			for _, product := range products[1:] {
				result.low, result.high = min(result.low, product), max(result.high, product)
			}
			return result, nil
		}
	case *ast.BuiltinNode:
		return boundReservationCost(&ast.CallNode{Callee: &ast.IdentifierNode{Value: n.Name}, Arguments: n.Arguments}, prompt, output, request)
	case *ast.CallNode:
		callee, ok := n.Callee.(*ast.IdentifierNode)
		if !ok {
			break
		}
		switch callee.Value {
		case "tier":
			return boundReservationCost(n.Arguments[1], prompt, output, request)
		case "fixed":
			amount, err := boundReservationCost(n.Arguments[0], prompt, output, request)
			return reservationRange{amount.low * 1_000_000, amount.high * 1_000_000}, err
		case "hour":
			return reservationRange{0, 23}, nil
		case "minute":
			return reservationRange{0, 59}, nil
		case "weekday":
			return reservationRange{0, 6}, nil
		case "month":
			return reservationRange{1, 12}, nil
		case "day":
			return reservationRange{1, 31}, nil
		case "min", "max", "abs", "ceil", "floor":
			left, err := boundReservationCost(n.Arguments[0], prompt, output, request)
			if err != nil {
				return reservationRange{}, err
			}
			switch callee.Value {
			case "abs":
				low := min(math.Abs(left.low), math.Abs(left.high))
				if left.low <= 0 && left.high >= 0 {
					low = 0
				}
				return reservationRange{low, max(math.Abs(left.low), math.Abs(left.high))}, nil
			case "ceil":
				return reservationRange{math.Ceil(left.low), math.Ceil(left.high)}, nil
			case "floor":
				return reservationRange{math.Floor(left.low), math.Floor(left.high)}, nil
			}
			for _, argument := range n.Arguments[1:] {
				right, err := boundReservationCost(argument, prompt, output, request)
				if err != nil {
					return reservationRange{}, err
				}
				if callee.Value == "min" {
					left = reservationRange{min(left.low, right.low), min(left.high, right.high)}
				} else {
					left = reservationRange{max(left.low, right.low), max(left.high, right.high)}
				}
			}
			return left, nil
		}
	}
	if !reservationDependsOnUsage(node) {
		value, _, err := RunExprWithRequest(node.String(), TokenParams{Len: prompt}, request)
		return reservationRange{value, value}, err
	}
	return reservationRange{}, fmt.Errorf("billing expression cannot be safely reserved: %s", node.String())
}
