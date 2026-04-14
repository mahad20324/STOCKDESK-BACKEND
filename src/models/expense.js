const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Expense extends Model {}

Expense.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    category: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    recordedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    shopId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: 'Expense', tableName: 'expenses', timestamps: true }
);

module.exports = Expense;
