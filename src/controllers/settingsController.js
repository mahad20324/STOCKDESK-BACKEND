const { Setting, Shop } = require('../models');
const { logAction } = require('./auditController');

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const settings = await Setting.findOne({ where: { shopId: req.user.shopId } });
    if (!settings) return res.status(404).json({ message: 'Settings not found' });

    await settings.update(req.body);
    logAction(req.user.id, req.user.shopId, 'UPDATE', 'SETTINGS', settings.id, { fields: Object.keys(req.body) }, req);
    res.json(settings);
  } catch (error) {
    next(error);
  }
};
