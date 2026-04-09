const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class UserProfile extends Model {}

UserProfile.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    displayRole: {
      type: DataTypes.ENUM('Admin', 'Manager', 'Cashier'),
      allowNull: false,
      defaultValue: 'Cashier',
    },
  },
  {
    sequelize,
    modelName: 'UserProfile',
    tableName: 'user_profiles',
    timestamps: true,
    underscored: false,
  }
);

module.exports = UserProfile;