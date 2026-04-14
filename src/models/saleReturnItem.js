const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class SaleReturnItem extends Model {}

SaleReturnItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    returnId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    refundAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    shopId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: 'SaleReturnItem', tableName: 'sale_return_items', timestamps: true }
);

module.exports = SaleReturnItem;
