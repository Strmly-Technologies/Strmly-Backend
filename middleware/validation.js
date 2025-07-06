const validator = require("validator");
const { body, validationResult } = require("express-validator");

const validateAndSanitize = {
  amount: (amount) => {
    if (!amount || typeof amount !== "number") {
      return { isValid: false, error: "Amount must be a valid number" };
    }
    if (amount <= 0) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }
    if (amount > 1000000) {
      return { isValid: false, error: "Amount exceeds maximum limit" };
    }
    if (amount !== Math.floor(amount)) {
      return { isValid: false, error: "Amount must be a whole number" };
    }
    return { isValid: true, value: amount };
  },

  string: (str, minLength = 1, maxLength = 500) => {
    if (!str || typeof str !== "string") {
      return { isValid: false, error: "Value must be a valid string" };
    }
    const trimmed = str.trim();
    if (trimmed.length < minLength) {
      return { isValid: false, error: `Minimum length is ${minLength} characters` };
    }
    if (trimmed.length > maxLength) {
      return { isValid: false, error: `Maximum length is ${maxLength} characters` };
    }

    const sanitized = validator.escape(trimmed);
    return { isValid: true, value: sanitized };
  },

  objectId: (id) => {
    if (!id || typeof id !== "string") {
      return { isValid: false, error: "ID must be a valid string" };
    }
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return { isValid: false, error: "Invalid ID format" };
    }
    return { isValid: true, value: id };
  },

  email: (email) => {
    if (!email || typeof email !== "string") {
      return { isValid: false, error: "Email must be a valid string" };
    }
    if (!validator.isEmail(email)) {
      return { isValid: false, error: "Invalid email format" };
    }
    return { isValid: true, value: email.toLowerCase() };
  },

  accountNumber: (accountNo) => {
    if (!accountNo || typeof accountNo !== "string") {
      return { isValid: false, error: "Account number must be a valid string" };
    }
    const cleaned = accountNo.replace(/\s/g, "");
    if (!/^\d{9,18}$/.test(cleaned)) {
      return { isValid: false, error: "Account number must be 9-18 digits" };
    }
    return { isValid: true, value: cleaned };
  },

  ifscCode: (ifsc) => {
    if (!ifsc || typeof ifsc !== "string") {
      return { isValid: false, error: "IFSC code must be a valid string" };
    }
    const cleaned = ifsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleaned)) {
      return { isValid: false, error: "Invalid IFSC code format" };
    }
    return { isValid: true, value: cleaned };
  },

  phone: (phone) => {
    if (!phone || typeof phone !== "string") {
      return { isValid: false, error: "Phone number must be a valid string" };
    }
    const cleaned = phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      return { isValid: false, error: "Invalid Indian mobile number" };
    }
    return { isValid: true, value: cleaned };
  },

  pagination: (page, limit) => {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1 || pageNum > 1000) {
      return { isValid: false, error: "Page must be between 1 and 1000" };
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return { isValid: false, error: "Limit must be between 1 and 100" };
    }
    return { isValid: true, page: pageNum, limit: limitNum };
  },
};

const validateWalletLoad = (req, res, next) => {
  const { amount } = req.body;

  const amountValidation = validateAndSanitize.amount(amount);
  if (!amountValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: amountValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  req.body.amount = amountValidation.value;
  next();
};

const validateSeriesPurchase = (req, res, next) => {
  const { seriesId, amount, transferNote } = req.body;

  const seriesValidation = validateAndSanitize.objectId(seriesId);
  if (!seriesValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: seriesValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  const amountValidation = validateAndSanitize.amount(amount);
  if (!amountValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: amountValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  if (transferNote) {
    const noteValidation = validateAndSanitize.string(transferNote, 0, 200);
    if (!noteValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: noteValidation.error,
        code: "VALIDATION_ERROR",
      });
    }
    req.body.transferNote = noteValidation.value;
  }

  req.body.seriesId = seriesValidation.value;
  req.body.amount = amountValidation.value;
  next();
};

const validateBankSetup = (req, res, next) => {
  const { account_number, ifsc_code, beneficiary_name, bank_name, account_type } = req.body;

  const accountValidation = validateAndSanitize.accountNumber(account_number);
  if (!accountValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: accountValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  const ifscValidation = validateAndSanitize.ifscCode(ifsc_code);
  if (!ifscValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: ifscValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  const nameValidation = validateAndSanitize.string(beneficiary_name, 2, 50);
  if (!nameValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: nameValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  if (bank_name) {
    const bankValidation = validateAndSanitize.string(bank_name, 2, 100);
    if (!bankValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: bankValidation.error,
        code: "VALIDATION_ERROR",
      });
    }
    req.body.bank_name = bankValidation.value;
  }

  if (account_type && !["savings", "current"].includes(account_type)) {
    return res.status(400).json({
      success: false,
      error: "Account type must be savings or current",
      code: "VALIDATION_ERROR",
    });
  }

  req.body.account_number = accountValidation.value;
  req.body.ifsc_code = ifscValidation.value;
  req.body.beneficiary_name = nameValidation.value;
  next();
};

const validateWithdrawal = (req, res, next) => {
  const { amount, notes } = req.body;

  const amountValidation = validateAndSanitize.amount(amount);
  if (!amountValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: amountValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  if (amount < 100) {
    return res.status(400).json({
      success: false,
      error: "Minimum withdrawal amount is ₹100",
      code: "VALIDATION_ERROR",
    });
  }

  if (amount > 100000) {
    return res.status(400).json({
      success: false,
      error: "Maximum withdrawal amount is ₹1,00,000",
      code: "VALIDATION_ERROR",
    });
  }

  if (notes) {
    const notesValidation = validateAndSanitize.string(notes, 0, 200);
    if (!notesValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: notesValidation.error,
        code: "VALIDATION_ERROR",
      });
    }
    req.body.notes = notesValidation.value;
  }

  req.body.amount = amountValidation.value;
  next();
};

const validateCommunityFee = [
  body("communityId")
    .notEmpty()
    .withMessage("Community ID is required")
    .isMongoId()
    .withMessage("Invalid community ID"),
  body("amount")
    .isNumeric()
    .withMessage("Amount must be a number")
    .isFloat({ min: 1, max: 5000 })
    .withMessage("Amount must be between ₹1 and ₹5000"),
  body("feeNote")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Fee note must be less than 200 characters"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors.array(),
        code: "VALIDATION_ERROR",
      });
    }
    next();
  },
];

const validateCommunitySettings = (req, res, next) => {
  const { communityId, feeType, feeAmount, feeDescription } = req.body;

  const communityValidation = validateAndSanitize.objectId(communityId);
  if (!communityValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: communityValidation.error,
      code: "VALIDATION_ERROR",
    });
  }

  if (feeType && !["free", "paid"].includes(feeType)) {
    return res.status(400).json({
      success: false,
      error: "Fee type must be 'free' or 'paid'",
      code: "VALIDATION_ERROR",
    });
  }

  if (feeAmount !== undefined) {
    const amountValidation = validateAndSanitize.amount(feeAmount);
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: "VALIDATION_ERROR",
      });
    }
    if (feeAmount > 5000) {
      return res.status(400).json({
        success: false,
        error: "Community fee cannot exceed ₹5000",
        code: "VALIDATION_ERROR",
      });
    }
    req.body.feeAmount = amountValidation.value;
  }

  if (feeDescription) {
    const descValidation = validateAndSanitize.string(feeDescription, 0, 200);
    if (!descValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: descValidation.error,
        code: "VALIDATION_ERROR",
      });
    }
    req.body.feeDescription = descValidation.value;
  }

  req.body.communityId = communityValidation.value;
  next();
};

module.exports = {
  validateAndSanitize,
  validateWalletLoad,
  validateSeriesPurchase,
  validateBankSetup,
  validateWithdrawal,
  validateCommunityFee,
  validateCommunitySettings,
};
