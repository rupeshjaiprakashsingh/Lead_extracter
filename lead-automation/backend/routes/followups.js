const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/followupController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

// All routes require auth + tenant
router.use(authenticateToken, tenantGuard);

router.get('/',                ctrl.getFollowups);
router.get('/stats',           ctrl.getStats);
router.post('/remove',         ctrl.removeFollowups);
router.post('/send-wa-bulk',   ctrl.sendWABulk);
router.post('/send-email-bulk', ctrl.sendEmailBulk);
router.post('/:id/send-wa',    ctrl.sendWA);
router.post('/:id/send-email', ctrl.sendEmail);

module.exports = router;
