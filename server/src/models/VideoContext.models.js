import mongoose from "mongoose";


const VideoContextSchema=new mongoose.Schema(
    {
        videoId:{
            type:String,
            required:true,
            unique:true,
            index:true,
        },
        channelId:{
            type:String,
            required:true
        },
        title:{type:String},
        description:{type:String}
    },
    {timestamps:true}
);

export default mongoose.model('VideoContext',VideoContextSchema);