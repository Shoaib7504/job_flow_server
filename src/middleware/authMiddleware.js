import jwt from "jsonwebtoken";
import { prisma } from "../config/db.connect.js";

//Read the token form the request
//check if token is valid

const authMiddleware = async (req, res, next) => {

    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }
    else if (req.cookies?.jobflow_token) {
        token = req.cookies.jobflow_token;
    }
    if(!token){
        return res.status(401).json({
            message: "Unauthorized",
            success: false,
            statusCode: 401,
            error: "Unauthorized"
        })
    }
    try {
  //verify token
  const decoded = jwt.verify(token,process.env.JWT_SECRET);
  //check user exists
  const user =await prisma.user.findUnique({where:{id:decoded.id}});
  if(!user){
    return res.status(401).json({
        message: "Unauthorized",
        success: false,
        statusCode: 401,
        error: "Unauthorized"
    })
  }
  if(!user){
    return res.status(401).json({
        message: "Unauthorized",
        success: false,
        statusCode: 401,
        error: "Unauthorized"
    })
  }
  //attach user to request
  req.user=user;
  next();  
    } catch (error) {
       console.log("error in auth middleware",error)
       res.status(401).json({
            message: "Not Authorized, token failed",
            success: false,
            statusCode: 401,
            error: "Not Authorized"
        })
    }
}


export default authMiddleware;