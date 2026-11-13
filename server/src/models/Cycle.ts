import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const cycleSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

cycleSchema.index({ project: 1, status: 1, createdAt: -1 });

export type CycleDocument = InferSchemaType<typeof cycleSchema> & { _id: Schema.Types.ObjectId };

export const Cycle = (models.Cycle as Model<CycleDocument>) || model<CycleDocument>('Cycle', cycleSchema);
