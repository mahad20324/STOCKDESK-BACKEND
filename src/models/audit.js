const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Audit extends Model {}

Audit.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'e.g., CREATE, UPDATE, DELETE, LOGIN, LOGOUT',
    },
    entityType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'e.g., PRODUCT, SALE, USER, SETTING',
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID of the affected entity',
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional details like old/new values',
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Audit',
    tableName: 'audits',
    timestamps: false,
    underscored: false,
    indexes: [
      { fields: ['shopId', 'createdAt'] },
      { fields: ['userId'] },
      { fields: ['entityType'] },
    ],
  }
);

module.exports = Audit;
