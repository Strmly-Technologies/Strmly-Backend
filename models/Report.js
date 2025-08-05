const mongoose=require('mongoose');

const reportSchema=new mongoose.Schema({
    reporter_id:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    content_type:{
        type:String,
        enum:['video','comment','community','series','user'],
        required:true
    },
    content_id:{
        type:mongoose.Schema.Types.ObjectId,
        required:true
    },
    reason:{
        type:String,
        required:true,
        enum:['spam','abuse','inappropriate','copyright','other']
    },
    description:{
        type:String,
        required:false,
        maxlength:500
    },
     status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  admin_notes: String,
  reviewed_by: {
    type: String, 
  },
  reviewed_at: Date,
  action_taken: {
    type: String,
    enum: ['none', 'warning', 'content_removed', 'user_suspended', 'user_banned']
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('Report', reportSchema)

