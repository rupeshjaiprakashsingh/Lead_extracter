const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const ctrl     = require('../controllers/leadController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');
const { checkLeadLimit, checkWALimit, checkExportEnabled } = require('../middleware/planGuard');
const { scrapeLimiter, exportLimiter } = require('../middleware/security');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// All routes require auth + tenant
router.use(authenticateToken, tenantGuard);

// Stats & filters
router.get('/stats',      ctrl.getStats);
router.get('/categories', ctrl.getCategories);
router.get('/cities',     ctrl.getCities);

// Scrape
router.post('/scrape', scrapeLimiter, checkLeadLimit, ctrl.scrape);

// CRUD
router.get('/',    ctrl.getLeads);
router.post('/',   checkLeadLimit, ctrl.createLead);
router.put('/:id', ctrl.updateLead);
router.delete('/', ctrl.deleteAllLeads);
router.delete('/:id', ctrl.deleteLead);
router.post('/bulk-delete', ctrl.bulkDelete);

// Import / Export
router.post('/import',                ctrl.importLeads);
router.post('/import-excel/preview',  upload.single('file'), ctrl.importExcelPreview);
router.post('/import-excel',          upload.single('file'), checkLeadLimit, ctrl.importExcel);
router.get('/export',                 exportLimiter, checkExportEnabled, ctrl.exportExcel);
router.get('/export-vcf',             exportLimiter, checkExportEnabled, ctrl.exportVCF);
router.post('/export-vcf',            exportLimiter, checkExportEnabled, ctrl.exportVCFSmart);

// Contact sync
router.get('/contacts/stats',        ctrl.getContactStats);
router.post('/contacts/mark-saved',  ctrl.markContactSaved);

// WA sending
router.post('/send/wa',        checkWALimit, ctrl.sendWA);
router.post('/send/wa-draft',  checkWALimit, ctrl.sendWADraft);
router.post('/send/wa-manual', checkWALimit, ctrl.sendWAManual);

// Email sending
router.post('/send/email', ctrl.sendEmail);

// Email extraction
router.post('/extract-emails', ctrl.extractEmails);

// Individual lead actions
router.get('/:id/message',          ctrl.getLeadMessage);
router.post('/:id/mark-wa',         ctrl.markWASent);
router.post('/:id/add-followup',    ctrl.addFollowup);
router.delete('/:id/remove-followup', ctrl.removeFollowup);

module.exports = router;
