package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateRinkoAIChannelTypePreservesExistingAndFutureChannels(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&Channel{}, &ForkDataMigration{}))

	previousDB := DB
	DB = database
	t.Cleanup(func() {
		DB = previousDB
	})

	legacyRinkoAI := Channel{
		Type:   legacyRinkoAIChannelType,
		Key:    "rinko-key",
		Name:   "existing-rinko",
		Models: "nai-diffusion-5-full",
		Group:  "default",
	}
	openAI := Channel{
		Type:   constant.ChannelTypeOpenAI,
		Key:    "openai-key",
		Name:   "existing-openai",
		Models: "gpt-test",
		Group:  "default",
	}
	require.NoError(t, database.Create(&legacyRinkoAI).Error)
	require.NoError(t, database.Create(&openAI).Error)

	require.NoError(t, migrateRinkoAIChannelType())

	var migrated Channel
	require.NoError(t, database.First(&migrated, legacyRinkoAI.Id).Error)
	assert.Equal(t, constant.ChannelTypeRinkoAI, migrated.Type)

	var untouched Channel
	require.NoError(t, database.First(&untouched, openAI.Id).Error)
	assert.Equal(t, constant.ChannelTypeOpenAI, untouched.Type)

	taskPlugin := Channel{
		Type:   constant.ChannelTypeTaskPlugin,
		Key:    "plugin-key",
		Name:   "future-task-plugin",
		Models: "video-test",
		Group:  "default",
	}
	require.NoError(t, database.Create(&taskPlugin).Error)
	require.NoError(t, migrateRinkoAIChannelType())

	var preservedTaskPlugin Channel
	require.NoError(t, database.First(&preservedTaskPlugin, taskPlugin.Id).Error)
	assert.Equal(t, constant.ChannelTypeTaskPlugin, preservedTaskPlugin.Type)

	var migrationCount int64
	require.NoError(t, database.Model(&ForkDataMigration{}).
		Where("name = ?", rinkoAIChannelTypeMigrationName).
		Count(&migrationCount).Error)
	assert.EqualValues(t, 1, migrationCount)
}
