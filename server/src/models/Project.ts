import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const projectSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: '', maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nextIssueNumber: { type: Number, default: 0 },
  },
  { timestamps: true },
);

projectSchema.index({ workspace: 1, key: 1 }, { unique: true });

export type ProjectDocument = InferSchemaType<typeof projectSchema> & { _id: Schema.Types.ObjectId };

export const Project = (models.Project as Model<ProjectDocument>) || model<ProjectDocument>('Project', projectSchema);
