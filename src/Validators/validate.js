export const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Validation failed",
      errors: result.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }
  req[source] = result.data;
  next();
};
