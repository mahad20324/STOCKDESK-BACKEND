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
    // WhatsApp settings per shop (optional)
    whatsapp_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    whatsapp_provider: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    whatsapp_sender_number: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    whatsapp_sender_id: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    whatsapp_opt_in_text: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: 'Shop',
    tableName: 'shops',
    timestamps: true,
    underscored: false,
    hooks: {
      // Ensure user emails are nulled and users removed when a shop is destroyed
      // (application-level safety; DB-level cascade should still be used in production)
      beforeDestroy: async (shop, options) => {
        const { sequelize } = require('../config/db');
        const User = require('./user');
        const t = options.transaction || (await sequelize.transaction());
        let createdTx = false;
        try {
          if (!options.transaction) createdTx = true;
          await User.update({ email: null, verificationToken: null, resetPasswordToken: null }, { where: { shopId: shop.id }, transaction: t });
          await User.destroy({ where: { shopId: shop.id }, transaction: t });
          if (createdTx) await t.commit();
        } catch (err) {
          if (createdTx) await t.rollback();
          throw err;
        }
      },
    },
  }
);

module.exports = Shop;