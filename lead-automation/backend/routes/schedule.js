const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/scheduleController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

// All routes require auth + tenant isolation
router.use(authenticateToken, tenantGuard);

// List / Create
router.get('/',               ctrl.getSchedule);
router.post('/',              ctrl.createSchedule);

// Per-rule operations (ordered: specific before generic)
router.post('/preview',       ctrl.previewSchedule);
router.post('/test-report',   ctrl.testReport);
router.get('/status',         ctrl.getStatus);

// Per-rule CRUD
router.put('/:id',            ctrl.updateSchedule);
router.delete('/:id',         ctrl.deleteSchedule);
router.post('/:id/run-now',   ctrl.runNow);

module.exports = router;
