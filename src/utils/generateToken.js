import jwt from "jsonwebtoken";

const generateToken = (userId,res)=>{
    const payload = {
       id: userId
    }
    const token = jwt.sign(payload,process.env.JWT_SECRET,{expiresIn:"7d"})
    
    res.cookie("jobflow_token",token,{
        maxAge: 7*24*60*60*1000,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV !== "development",
    })

    return token
}
export {generateToken}