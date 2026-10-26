import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { INVITE_ROLES } from '../constants';

const inviteSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: INVITE_ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

inviteSchema.index({ workspace: 1, email: 1 });

export type InviteDocument = InferSchemaType<typeof inviteSchema> & { _id: Schema.Types.ObjectId };

export const Invite = (models.Invite as Model<InviteDocument>) || model<InviteDocument>('Invite', inviteSchema);
