const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class StockReconciliation extends Model {}

StockReconciliation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    systemQuantity: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Quantity recorded in system',
    },
    physicalQuantity: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Actual quantity counted',
    },
    variance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Difference (physicalQuantity - systemQuantity)',
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Reason for variance (e.g., damage, theft, count error)',
    },
    adjustedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reconciliationDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'StockReconciliation',
    tableName: 'stock_reconciliations',
    timestamps: true,
    underscored: false,
    indexes: [
      { fields: ['shopId', 'reconciliationDate'] },
      { fields: ['productId'] },
      { fields: ['adjustedByUserId'] },
    ],
  }
);

module.exports = StockReconciliation;
