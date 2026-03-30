const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Shop extends Model {}

Shop.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Shop',
    tableName: 'shops',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Shop;