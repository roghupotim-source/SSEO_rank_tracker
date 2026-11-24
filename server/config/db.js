// import mongoose from "mongoose";

// const connectDB = async () => {
//     mongoose.connection.on("connected", ()=> console.log("MongoDB connected"))
//     await mongoose.connect(process.env.MONGODB_URI)
// }

// export default connectDB


import mongoose from "mongoose";

let cached = globalThis.mongoose;

if (!cached) {
    cached = globalThis.mongoose = {
        conn: null,
        promise: null
    };
}

const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGODB_URI)
            .then((mongooseInstance) => {
                console.log("MongoDB connected");
                return mongooseInstance;
            })
            .catch((error) => {
                cached.promise = null;
                throw error;
            });
    }

    cached.conn = await cached.promise;
    return cached.conn;
};

export default connectDB;
