const { Customer, Sale } = require('../models');
const { Op, fn, col } = require('sequelize');
const { logAction } = require('./auditController');

function normalizeCustomerPayload(body) {
  return {
    name: String(body.name || '').trim(),
    phone: body.phone ? String(body.phone).trim() : null,
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    address: body.address ? String(body.address).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    isActive: body.isActive !== false,
  };
}

exports.listCustomers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = { shopId: req.user.shopId };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const customers = await Customer.findAll({
      where,
      attributes: {
        include: [[fn('COUNT', col('sales.id')), 'salesCount']],
      },
      include: [
        {
          model: Sale,
          as: 'sales',
          attributes: [],
          required: false,
        },
      ],
      group: ['Customer.id'],
      order: [['name', 'ASC']],
    });

    res.json(customers);
  } catch (error) {
    next(error);
  }
};

exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    next(error);
  }
};

exports.createCustomer = async (req, res, next) => {
  try {
    const payload = normalizeCustomerPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ message: 'Customer name is required' });
    }

    const customer = await Customer.create({
      ...payload,
      shopId: req.user.shopId,
    });
    logAction(req.user.id, req.user.shopId, 'CREATE', 'CUSTOMER', customer.id, { name: customer.name, phone: customer.phone }, req);
    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
};

exports.updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const payload = normalizeCustomerPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ message: 'Customer name is required' });
    }

    await customer.update(payload);
    logAction(req.user.id, req.user.shopId, 'UPDATE', 'CUSTOMER', customer.id, { name: customer.name }, req);
    res.json(customer);
  } catch (error) {
    next(error);
  }
};

exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const linkedSales = await Sale.count({ where: { customerId: customer.id, shopId: req.user.shopId } });
    if (linkedSales > 0) {
      return res.status(400).json({ message: 'Customer has sales history and cannot be deleted' });
    }

    logAction(req.user.id, req.user.shopId, 'DELETE', 'CUSTOMER', customer.id, { name: customer.name }, req);
    await customer.destroy();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};