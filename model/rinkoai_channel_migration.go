package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm"
)

const (
	legacyRinkoAIChannelType        = 61
	rinkoAIChannelTypeMigrationName = "20260908_rinko_ai_channel_type_62"
)

type ForkDataMigration struct {
	Name      string `gorm:"primaryKey;type:varchar(191)"`
	AppliedAt int64  `gorm:"bigint;not null"`
}

func migrateRinkoAIChannelType() error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var migration ForkDataMigration
		err := tx.Where("name = ?", rinkoAIChannelTypeMigrationName).First(&migration).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("check RinkoAI channel migration: %w", err)
		}

		result := tx.Model(&Channel{}).
			Where("type = ?", legacyRinkoAIChannelType).
			Update("type", constant.ChannelTypeRinkoAI)
		if result.Error != nil {
			return fmt.Errorf("migrate RinkoAI channel type: %w", result.Error)
		}

		migration = ForkDataMigration{
			Name:      rinkoAIChannelTypeMigrationName,
			AppliedAt: time.Now().Unix(),
		}
		if err := tx.Create(&migration).Error; err != nil {
			return fmt.Errorf("record RinkoAI channel migration: %w", err)
		}
		if result.RowsAffected > 0 {
			common.SysLog(fmt.Sprintf("migrated %d RinkoAI channel(s) from type %d to %d", result.RowsAffected, legacyRinkoAIChannelType, constant.ChannelTypeRinkoAI))
		}
		return nil
	})
}
