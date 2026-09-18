import test from 'node:test';
import assert from 'node:assert/strict';
import {saveMyProfile,userProfile} from '../src/lib/profile.ts';

test('profile saving targets only the authenticated user and only editable display fields',async()=>{
 let writes=0,saved;
 const auth={async updateUser(attributes){writes++;saved=attributes;return {data:{user:{id:'signed-in-user',user_metadata:attributes.data}},error:null}}};
 const input={fullName:'  María Rivera  ',school:'  Escuela Norte ',teachingRole:'English teacher',bio:'I teach beginners.',id:'other-user',role:'owner',email:'different@example.test',betaAllowance:100};
 const result=await saveMyProfile(auth,input);
 assert.deepEqual(saved,{data:{full_name:'María Rivera',teacherflow_profile:{school:'Escuela Norte',teachingRole:'English teacher',bio:'I teach beginners.'}}});
 assert.deepEqual(result,{fullName:'María Rivera',school:'Escuela Norte',teachingRole:'English teacher',bio:'I teach beginners.'});
 assert.equal(writes,1);
 await assert.rejects(saveMyProfile(auth,{...input,fullName:' '}));
 await assert.rejects(saveMyProfile(auth,{...input,bio:'x'.repeat(501)}));
 assert.equal(writes,1,'Invalid input cannot make an account update');
 await saveMyProfile(auth,{...input,school:'',teachingRole:'',bio:''});
 assert.equal(saved.data.teacherflow_profile.bio,'','Optional fields can be cleared');
});
test('legacy metadata and expired sessions are handled without a false saved result',async()=>{
 assert.deepEqual(userProfile({user_metadata:{full_name:'Old Name',teacherflow_profile:'invalid'}}),{fullName:'Old Name',school:'',teachingRole:'',bio:''});
 const input={fullName:'Teacher',school:'',teachingRole:'',bio:''};
 await assert.rejects(saveMyProfile({updateUser:async()=>({data:{user:null},error:{message:'Session expired'}})},input),/Session expired/);
 await assert.rejects(saveMyProfile({updateUser:async()=>({data:{user:null},error:null})},input),/could not be saved/);
});
