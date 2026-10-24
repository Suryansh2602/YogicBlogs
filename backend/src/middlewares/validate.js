/**
 * Validate req.body / req.params / req.query against zod schemas and replace them
 * with the parsed (typed, stripped) values.
 *
 * Usage: router.post('/', validate({ body: createArticleSchema }), controller.create)
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['body', 'params', 'query']) {
    if (schemas[key]) {
      const value = schemas[key].parse(req[key]);
      // Express 5 makes req.query a getter, so redefine it instead of assigning.
      Object.defineProperty(req, key, { value, writable: true, configurable: true, enumerable: true });
    }
  }
  next();
};
