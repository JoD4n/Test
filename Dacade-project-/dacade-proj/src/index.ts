import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt , blob, nat, Principal,int8} from 'azle';
import { managementCanister } from 'azle/canisters/management';
import {
    binaryAddressFromPrincipal,
    hexAddressFromPrincipal,
    binaryAddressFromAddress,
    Ledger,
} from 'azle/canisters/ledger';

type User= Record<{
    id: nat64;
    createdAt: nat64;
    updatedAt: Opt<nat64>;
    deposited:nat;
    address:Principal
    winamount:nat
}>
import { Token } from './types';

let tokenCanister:Token

const UserStorage = new StableBTreeMap<Principal, User>(0, 44, 2048);

const icp = new Ledger(
    Principal.fromText(""
    )
);




let owner: Principal;

let id:nat = 0n

let network: int8;
let myCanister:string; 

$update;
export function initialise(_network:int8,tokenAddress:string):void{
    owner = ic.caller();
    tokenCanister = new Token(Principal.fromText(tokenAddress));

    myCanister = ic.id().toString();

    if(_network == 0){
        network = 0;
    }else if(_network == 1){
        network =1;

    }
    else{
        ic.trap("Invalid network option choose 0 or 1")
    }
}


$update;
export async function initializeBalance(): Promise<Result<string, string>>{

    // set up network for testing
    if (network == 0){

        const returnValue = await tokenCanister.initializeSupply('MockToken', myCanister, 'MCK', 1_000_000_000_000_000n).call();
        if (returnValue.Ok){
            return Result.Ok<string,string>("Fund initialised")
        }
        else if(returnValue.Err){
            return Result.Err<string,string>(returnValue.Err)
        }
    }
    return Result.Err<string, string>(`network is set to ${network}`);
}

$update;
export function createAccount():Result<User,string>{
    let caller = ic.caller()
    return(match(UserStorage.get(caller),{
        Some:()=>{
            return(Result.Err<User,string>("You already have an account"))
        },
        None:()=>{
            let message : User= {id:BigInt(id),createdAt:ic.time(),
                updatedAt:Opt.Some(ic.time()),deposited:0n,address:caller,winamount:0n}
                UserStorage.insert(caller,message)
                id++
                return(Result.Ok<User,string>(message))
        },
    }))

}



export async function withdraw(amount: nat): Promise<Result<string, string>> {
    let caller = ic.caller();
    return match(UserStorage.get(caller), {
      Some: async (arg) => {
        let fromsubAccount: blob = binaryAddressFromPrincipal(ic.id(), 0);
        const currentWithdrawableBalance = arg.deposited + arg.winamount;
        if (currentWithdrawableBalance < amount) {
          ic.trap("You don't have enough funds");
        }
  
        const transferResult = await icp.transfer({
          memo: 0n,
          amount: {
            e8s: amount,
          },
          fee: {
            e8s: 10000n,
          },
          from_subaccount: Opt.Some(fromsubAccount),
          to: binaryAddressFromAddress(ic.caller().toString()),
          created_at_time: Opt.None,
        }).call();
  
        if (transferResult.Err) {
          ic.trap(transferResult.Err.toString());
        }
  
        return Result.Ok<string, string>(`${amount} withdrawn`);
      },
      None: () => Result.Err<string, string>("Withdrawal Failed"),
    });
  }
  




export async function input(num: nat): Promise<Result<string, string>> {
    let caller = ic.caller();
    return match(UserStorage.get(caller), {
      Some: async (arg) => {
        let deposit = arg.deposited;
        if (deposit < 10n) {
          ic.trap("Insufficient Funds");
        }
        let randomnum = await getRandomness();
        if (randomnum.Ok === num) {
          arg.winamount = arg.winamount + 20n;
          arg.deposited = arg.deposited - 10n;
          arg.updatedAt = Opt.Some(ic.time());
          UserStorage.insert(caller, { ...arg });
          return Result.Ok<string, string>("You won");
        } else {
          arg.deposited = arg.deposited - 10n;
          arg.updatedAt = Opt.Some(ic.time());
          UserStorage.insert(caller, { ...arg });
          return Result.Ok<string, string>("You lost");
        }
      },
      None: async () => {
        return Result.Err<string, string>("Error occurred");
      },
    });
  }
  
  
  $query;

  export function deposit(amountToDeposit:nat): Promise<Result<string, string>> {
    let caller = ic.caller();
    return new Promise(async (resolve) => {
      const result = await match(UserStorage.get(caller), {
        Some: async (arg) => {

          if(network == 0 ){
            let status = (await tokenCanister.transfer(ic.caller().toString(), myCanister, amountToDeposit).call()).Ok;   
            if(!status){
                ic.trap("Failed to Deposit")
            }

          } else{
          let fromsubAccount: blob = binaryAddressFromPrincipal(ic.id(), generateUniqueNumber(ic.caller()));
          let tosubAccount: blob = binaryAddressFromPrincipal(ic.id(), 0);
          let balance = (await icp.account_balance({ account: fromsubAccount }).call()).Ok?.e8s;
  
          if (balance !== undefined) {
            let message: User = { ...arg, deposited: balance };
            UserStorage.insert(caller, message);
  
            const transferResult = await icp.transfer({
              memo: 0n,
              amount: {
                e8s: balance,
              },
              fee: {
                e8s: 10000n,
              },
              from_subaccount: Opt.Some(fromsubAccount),
              to: tosubAccount,
              created_at_time: Opt.None,
            }).call();
  
            if (transferResult.Err) {
              ic.trap(transferResult.Err.toString());
            }
  
            return Result.Ok<string, string>("Icp tokens deposited");
          } else {
            return Result.Err<string, string>("Please deposit ICP tokens to the specified address");
          }

        }
        },
        None: () => {
          return Result.Err<string, string>("Error occurred");
        },
      });
  
      resolve(result);
    });
  }
  


$update;
export async function getRandomness(): Promise<Result<nat,string>> {
    const randomnessResult = await managementCanister.raw_rand().call();
    let element = [4];
    return match(randomnessResult, {
        Ok: (randomness) => {
            return  Result.Ok<nat,string>(BigInt(randomness[4]%20))
        },
        Err: () => Result.Err<nat,string>("Error occured")
    });

}

$query;
export function getDepositedAmount(): Result<nat, string> {
    let caller = ic.caller();
    return match(UserStorage.get(caller), {
      Some: (arg) => Result.Ok<nat, string>(arg.deposited),
      None: () => Result.Err<nat, string>("Error occurred"),
    });
  }
  
$query;
  export function getWinAmount(): Result<nat, string> {
    let caller = ic.caller();
    return match(UserStorage.get(caller), {
      Some: (arg) => Result.Ok<nat, string>(arg.winamount),
      None: () => Result.Err<nat, string>("No id found"),
    });
  }
  

function generateUniqueNumber(principal: Principal): number {
    const hexadecimal = principal.toHex();
  
    const bigIntValue = BigInt(hexadecimal);
  
    const uniqueNumber = Number(bigIntValue);
    return uniqueNumber;
  }

  
  $query;
  export function getDepositAddress():string{
      let caller = ic.caller()
      let uniqueNumber = generateUniqueNumber(caller)
      return(hexAddressFromPrincipal(ic.id(),uniqueNumber))
  }
