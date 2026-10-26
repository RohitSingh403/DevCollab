import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { ROLES } from '../constants';

const membershipSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);

membershipSchema.index({ workspace: 1, user: 1 }, { unique: true });

export type MembershipDocument = InferSchemaType<typeof membershipSchema> & { _id: Schema.Types.ObjectId };

export const Membership =
  (models.Membership as Model<MembershipDocument>) || model<MembershipDocument>('Membership', membershipSchema);
