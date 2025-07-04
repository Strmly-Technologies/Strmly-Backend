const mongoose = require("mongoose");


const userAccessSchema=new mongoose.Schema({
    user_id:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    content_id:{
        type:mongoose.Schema.Types.ObjectId,
        required:true
    },
    content_type:{
        type:String,
        required:true,
        enum:["series","standalone_video","Series"]
    },
    access_type:{
        type:String,
        required:true,
        enum:["free","paid","subscription"],
        default:"paid"
    },
    payment_id:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Payment",
        required:function(){
            return this.access_type==='paid';
        }
    },
    expires_at:{
        type:Date,
        default:null,
    },
    granted_at:{
        type:Date,
        default:Date.now
    }
},
    {timestamps:true}
);

userAccessSchema.index({ user_id: 1, content_id: 1, content_type: 1 }, { unique: true });

const UserAccess=mongoose.model("UserAccess",userAccessSchema);
module.exports=UserAccess;
