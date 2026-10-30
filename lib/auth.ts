import { getAdministrator } from './administrator';
// Legacy administration also requires the independent administrator session.
export async function getActor() {
 const admin = await getAdministrator();
 return admin ? {user:{userId:admin.id,email:'',displayName:admin.username,fullName:admin.username},isAdmin:true,member:null} : null;
}
