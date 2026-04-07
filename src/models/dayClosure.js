const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class DayClosure extends Model {}

DayClosure.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    closedForDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    netSales: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grossSales: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grossProfit: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    itemsSold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    orderCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    discountTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    closedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'DayClosure',
    tableName: 'day_closures',
    timestamps: true,
    underscored: false,
    indexes: [
      {
        unique: true,
        fields: ['shopId', 'closedForDate'],
      },
    ],
  }
);

module.exports = DayClosure;