const { asyncHandler } = require('../middleware/authMiddleware');

function makeLoanController(loanService) {
  return {
    submit: asyncHandler(async (req, res) => {
      const row = await loanService.submit(req.auth, req.body);
      res.status(201).json(row);
    }),
    listMine: asyncHandler(async (req, res) => {
      res.json(await loanService.listMine(req.auth));
    }),
    listPending: asyncHandler(async (req, res) => {
      res.json(await loanService.listPending());
    }),
    listAll: asyncHandler(async (req, res) => {
      res.json(await loanService.listAll(req.query));
    }),
    decide: asyncHandler(async (req, res) => {
      res.json(await loanService.decide(req.params.id, req.auth, req.body));
    }),
  };
}

module.exports = { makeLoanController };
