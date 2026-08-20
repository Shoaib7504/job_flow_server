import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createApplication,
  deleteApplication,
  getApplication,
  getApplications,
  patchApplication,
  updateApplication,
} from "../controller/applicationController.js";
import { validate } from "../Validators/validate.js";
import {
  createApplicationSchema,
  idSchema,
  patchApplicationSchema,
  updateApplicationSchema,
} from "../Validators/applicationValidator.js";

const router = express.Router();

router.use(authMiddleware);

router
  .route("/")
  .get(getApplications)
  .post(validate(createApplicationSchema), createApplication);

router
  .route("/:id")
  .get(validate(idSchema, "params"), getApplication)
  .put(validate(idSchema, "params"), validate(updateApplicationSchema), updateApplication)
  .patch(validate(idSchema, "params"), validate(patchApplicationSchema), patchApplication)
  .delete(validate(idSchema, "params"), deleteApplication);

export default router;
