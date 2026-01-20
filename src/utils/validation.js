const Joi = require('joi');
const validator = require('validator');

// Custom validators
const passwordSchema = Joi.string()
  .min(8)
  .max(255)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 255 characters',
  });

const strongPasswordSchema = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters',
    'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
  });

const emailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Invalid email address',
  });

const phoneSchema = Joi.string()
  .pattern(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/)
  .messages({
    'string.pattern.base': 'Invalid phone number',
  });

// Validation schemas
const schemas = {
  register: Joi.object({
    email: emailSchema,
    password: strongPasswordSchema,
    role: Joi.string()
      .valid('host', 'buyer', 'investor')
      .required(),
    full_name: Joi.string()
      .min(2)
      .max(255)
      .required(),
    phone: phoneSchema.optional(),
    profile: Joi.object().required(),
  }),

  login: Joi.object({
    email: emailSchema,
    password: Joi.string().required(),
  }),

  updateProfile: Joi.object({
    full_name: Joi.string()
      .min(2)
      .max(255),
    phone: phoneSchema,
    profile: Joi.object(),
  }).min(1),

  hostProfile: Joi.object({
    solar_capacity_kw: Joi.number()
      .positive()
      .required()
      .messages({
        'number.positive': 'Solar capacity must be positive',
      }),
    panel_brand: Joi.string(),
    panel_model: Joi.string(),
    installation_date: Joi.date(),
    has_battery: Joi.boolean(),
    battery_capacity_kwh: Joi.number()
      .positive()
      .when('has_battery', {
        is: true,
        then: Joi.required(),
      }),
    address: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    pincode: Joi.string(),
  }),

  buyerProfile: Joi.object({
    monthly_avg_consumption: Joi.number().positive(),
    household_size: Joi.number().positive(),
    has_ac: Joi.boolean(),
    ac_tonnage: Joi.number().positive(),
    has_ev: Joi.boolean(),
    ev_battery_kwh: Joi.number().positive(),
    house_type: Joi.string(),
  }),

  iotData: Joi.object({
    device_id: Joi.string().required(),
    user_id: Joi.string().uuid().required(),
    timestamp: Joi.alternatives().try(
      Joi.date(),
      Joi.string().isoDate()
    ).required(),
    measurements: Joi.object({
      power_kw: Joi.number().min(0).allow(null),
      energy_kwh: Joi.number().min(0).allow(null),
      voltage: Joi.number().allow(null),
      current: Joi.number().allow(null),
      frequency: Joi.number().allow(null),
      power_factor: Joi.number().allow(null),
      battery_soc: Joi.number().min(0).max(100).allow(null),
      temperature: Joi.number().allow(null),
    }).required().unknown(true),
  }).unknown(true),

  deviceRegistration: Joi.object({
    device_id: Joi.string().required(),
    device_type: Joi.string()
      .valid('solar_meter', 'consumption_meter', 'battery_bms', 'weather_station')
      .required(),
    device_model: Joi.string(),
    location: Joi.object({
      lat: Joi.number().min(-90).max(90),
      lon: Joi.number().min(-180).max(180),
    }),
  }),

  passwordReset: Joi.object({
    email: emailSchema,
  }),

  passwordResetConfirm: Joi.object({
    token: Joi.string().required(),
    newPassword: strongPasswordSchema,
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  walletTopup: Joi.object({
    amount: Joi.number()
      .positive()
      .min(1)
      .max(50000)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
        'number.min': 'Minimum top-up amount is ₹1',
        'number.max': 'Maximum top-up amount is ₹50,000',
      }),
    currency: Joi.string()
      .valid('INR', 'USD')
      .default('INR'),
  }),

  withdrawal: Joi.object({
    amount: Joi.number()
      .positive()
      .min(100)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
        'number.min': 'Minimum withdrawal amount is ₹100',
      }),
    bank_account_id: Joi.string().required(),
  }),
};

// Validate function
const validate = (data, schema) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.reduce((acc, err) => {
      acc[err.path.join('.')] = err.message;
      return acc;
    }, {});
    throw new Error(JSON.stringify(details));
  }

  return value;
};

// Middleware for validation
const validationMiddleware = (schema) => {
  return (req, res, next) => {
    try {
      req.body = validate(req.body, schema);
      next();
    } catch (error) {
      res.status(400).json({
        error: 'ValidationError',
        details: JSON.parse(error.message),
      });
    }
  };
};

module.exports = {
  schemas,
  validate,
  validationMiddleware,
  passwordSchema,
  strongPasswordSchema,
  emailSchema,
  phoneSchema,
};
