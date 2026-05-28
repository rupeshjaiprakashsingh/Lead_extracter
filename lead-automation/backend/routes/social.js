const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/socialController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

// All routes require auth + tenant
router.use(authenticateToken, tenantGuard);

router.get('/settings',  ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);
router.get('/posts',     ctrl.getPosts);
router.post('/preview',  ctrl.generatePreview);
router.post('/post',     ctrl.postNow);
router.post('/test-connections', ctrl.testConnections);

module.exports = router;
