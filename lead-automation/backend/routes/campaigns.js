const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/campaignController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

// All routes require auth + tenant
router.use(authenticateToken, tenantGuard);

router.get('/',                 ctrl.getAllCampaigns);
router.get('/stats',            ctrl.getStats);
router.get('/keyword/:keyword', ctrl.getByKeyword);

module.exports = router;
