const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class ShopActivity extends Model {}

ShopActivity.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActiveUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'ShopActivity',
    tableName: 'shop_activities',
    timestamps: true,
    underscored: false,
  }
);

module.exports = ShopActivity;