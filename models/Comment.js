const mongoose = require('mongoose')
 

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  long_video: { type: mongoose.Schema.Types.ObjectId, ref: 'LongVideo', default: null },
  short_video: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortVideo', default: null },
  parent_comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  content: { type: String, required: true, trim: true, maxlength: 500 },
  likes: { type: Number, default: 0 },
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  donations: { type: Number, default: 0 },
  upvoted_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downvoted_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  liked_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  donated_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
}, { timestamps: true });  

commentSchema.pre('save', function (next) {
  const targets = [this.long_video, this.short_video, this.parent_comment].filter(Boolean);
  if (targets.length !== 1) {
    return next(new Error('Comment must reference exactly one of long_video, short_video, or parent_comment.'));
  }
  next();
});


commentSchema.index({ user: 1, long_video: 1 });
commentSchema.index({ user: 1, short_video: 1 });
commentSchema.index({ user: 1, parent_comment: 1 });
const Comment= mongoose.model("Comment", commentSchema);
module.exports=Comment