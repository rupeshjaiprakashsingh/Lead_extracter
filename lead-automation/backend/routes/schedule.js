const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/scheduleController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

// All routes require auth + tenant
router.use(authenticateToken, tenantGuard);

router.get('/',            ctrl.getSchedule);
router.post('/',           ctrl.saveSchedule);
router.post('/run-now',    ctrl.runNow);
router.get('/status',      ctrl.getStatus);
router.post('/test-report', ctrl.testReport);

module.exports = router;
