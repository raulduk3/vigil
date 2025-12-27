import { hashPassword } from "../src/auth/password";

const password = "txg*gtj0RAC*zqf!ajf";
const hash = await hashPassword(password);
console.log(hash);
