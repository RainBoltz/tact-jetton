import "@stdlib/deploy";
import "./jetton";
message Mint {
    queryId: Int as uint64;
    amount: Int as coins;
    receiver: Address;
}
message EditContent {
    queryId: Int as uint64;
    content: Cell;
}
message Withdraw {
    queryId: Int as uint64;
    to: Address?;
}

contract TactJetton with Jetton, Deployable {
    totalSupply: Int as coins;
    owner: Address;
    content: Cell;
    mintable: Bool;
    init(owner: Address, content: Cell){
        self.totalSupply = 0;
        self.owner = owner;
        self.mintable = true;
        self.content = content;
    }

    receive(msg: Mint){
        self.requireOwner();
        require(self.mintable, "Minting is disabled");
        self.mint(msg.receiver, msg.amount, self.owner);
    }

    receive("stop_minting"){
        self.requireOwner();
        self.mintable = false;
    }

    receive("resume_minting"){
        self.requireOwner();
        self.mintable = true;
    }
}