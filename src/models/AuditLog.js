import mongoose from "mongoose";

// Who did what, to which record, and when. It stores NO medical content and no field values - only
// the names of fields that were changed. Entries are only ever added: this app has no code that edits or
// deletes them (and the hooks below refuse to), and they are not deleted automatically.
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String, trim: true, maxlength: 120 }, // kept as written at the time
    userRole: { type: String, trim: true, maxlength: 30 },
    action: {
      type: String,
      required: true,
      enum: ["view", "create", "update", "delete", "print", "login", "login_failed", "logout", "denied"],
    },
    resource: { type: String, trim: true, maxlength: 60 }, // patient, consultation, report, prescription ...
    resourceId: { type: String, trim: true, maxlength: 40 },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" }, // set when the action concerns one patient
    fields: { type: [String], default: undefined }, // names of the fields sent with a create / update
    status: { type: Number },
    method: { type: String, maxlength: 10 },
    path: { type: String, maxlength: 200 }, // e.g. /api/patients/:id/reports/:id
    ip: { type: String, maxlength: 60 },
    userAgent: { type: String, maxlength: 200 },
    note: { type: String, trim: true, maxlength: 200 },
  },
  { versionKey: false }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ patient: 1, at: -1 });
auditLogSchema.index({ user: 1, at: -1 });

// Append-only: refuse changes made through Mongoose
const refuse = function refuse(next) {
  next(new Error("Audit log entries cannot be changed or deleted"));
};
["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"].forEach((op) =>
  auditLogSchema.pre(op, refuse)
);
auditLogSchema.pre("save", function blockResave(next) {
  if (!this.isNew) return next(new Error("Audit log entries cannot be changed or deleted"));
  return next();
});

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);