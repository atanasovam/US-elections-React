import * as React from 'react';
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Button from './components/Button';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';
import {
  US_ELECTION_ADDRESS
} from './constants';
import { getContract } from './helpers/ethers';
import US_ELECTION from './constants/abis/USElection.json';


const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const FormButton =  styled.button`
  width: 100%;
  padding: 15px;
  font-size: 18px;
  transition: all 0.5s;
  cursor: pointer;
  background-color: #4099ff;
  border: 2px solid #4099ff;
  color: white;
  font-weight: 600;

  &:hover {
    transition: all 0.5s;
    color: #4099ff;
    background-color: white;
  }
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

const STestButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
`;

interface ISeats {
  trump: number;
  biden: number;
}

interface IForm {
  stateName: string;
  trump: number;
  biden: number;
  seats: number;
}

interface IAppState {
  fetching: boolean;
  address: string;
  library: any;
  connected: boolean;
  chainId: number;
  pendingRequest: boolean;
  result: any | null;
  electionContract: any | null;
  seats: ISeats;
  form: IForm,
  hasEnded: boolean;
  info: any | null;
}

const INITIAL_STATE: IAppState = {
  fetching: false,
  address: '',
  library: null,
  connected: false,
  chainId: 1,
  pendingRequest: false,
  result: null,
  electionContract: null,
  seats: {
    trump: 0,
    biden: 0
  },
  form: {
    stateName: '',
    trump: 0,
    biden: 0,
    seats: 0
  },
  hasEnded: false,
  info: null
};

class App extends React.Component<any, any> {
  // @ts-ignore
  public web3Modal: Web3Modal;
  public state: IAppState;
  public provider: any;

  constructor(props: any) {
    super(props);
    this.state = {
      ...INITIAL_STATE
    };

    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions()
    });
  }

  public componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect();
    }
  }

  public onConnect = async () => {
    const provider = await this.web3Modal.connect();
    const library = new Web3Provider(provider);
    const network = await library.getNetwork();

    const address = provider.selectedAddress ? provider.selectedAddress : provider?.accounts[0];

    const electionContract = getContract(US_ELECTION_ADDRESS, US_ELECTION.abi, library, address);
    const hasEnded = await electionContract.electionEnded();

    await this.setState({
      provider,
      library,
      chainId: network.chainId,
      address,
      connected: true,
      seats: {
        trump: 0,
        biden: 0
      },
      form: {
        stateName: '',
        trump: 0,
        biden: 0,
        seats: 0
      },
      hasEnded,
      electionContract
    });

    await this.currentLeader();

    await this.updateSeats();

    await this.subscribeToProviderEvents(provider);
  };

  public updateSeats = async (): Promise<any> => {
    const { electionContract } = this.state;

    const trump = await electionContract.seats(1);
    const biden = await electionContract.seats(2);

    const currentSeats: ISeats = { biden, trump };

    this.setState({ seats: currentSeats });

    return Promise.resolve(currentSeats);
  };

  public currentLeader = async () => {
    await this.setState({ fetching: true });

    const { electionContract } = this.state;

    const currentLeader = await electionContract.currentLeader();

    if (currentLeader < 0) {
      await this.setState({ info: { message: '[func: currentLeader] Unsuccessful transaction!' } });
      return;
    }

    await this.setState({ fetching: false });
    await this.setState({ info: { message: `Current Leader: ${currentLeader}`, link: '#' } });
  };

  public submitElectionResult = async () => {
    const { electionContract } = this.state;
    if (!electionContract) {
      return;
    }

    const { stateName, trump, biden, seats } = this.state.form;
    const data = [stateName, trump, biden, seats];

    await this.setState({ fetching: true });

    try {
      const transaction = await electionContract.submitStateResult(data);

      await this.setState({ transactionHash: transaction.hash });

      const transactionReceipt = await transaction.wait();

      if (transactionReceipt.status !== 1) {
        await this.setState({ fetching: false });
        await this.setState({ info: { message: '[func: submitElectionResult] Unsuccessful transaction!' } });
        return;
      }

      await this.setState({ fetching: false });
      await this.updateSeats();

    } catch (error) {
      await this.setState({ fetching: false });
      await this.setState({ info: { message: `[func: submitElectionResult] ${error.error.message}` } });
    }
  };

  public endElection = async () => {
    try {
      const { electionContract } = this.state;

      if (!electionContract) {
        return;
      }

      await this.setState({ fetching: true });

      const endTransaction = await electionContract.endElection();
      const endTransactionReceipt = await endTransaction.wait();

      if (endTransactionReceipt.status !== 1) {
        return;
      }

      await this.setState({ hasEnded: true });
      await this.setState({ info: { message: `Etherscan tx: ${endTransaction.hash}`, link: `${endTransaction.explorer}/tx/${endTransaction.hash}` } });
      await this.setState({ fetching: false });

    } catch (e) {
      await this.setState({ fetching: false });
      await this.setState({ info: { message: e, link: '#' } });
    }
  };

  public resumeElection = async () => {
    const { electionContract } = this.state;

    if (!electionContract) {
      return;
    }

    await this.setState({ fetching: true });
    const result = await electionContract.resumeElection();

    if (result) {
      await this.setState({ hasEnded: false });
      await this.setState({ fetching: false });
      return;
    }

    await this.setState({ fetching: false });
  };

  public subscribeToProviderEvents = async (provider: any) => {
    if (!provider.on) {
      return;
    }
    provider.on("close", () => this.resetApp());

    provider.on("accountsChanged", async (accounts: string[]) => {
      await this.setState({ address: accounts[0] });
    });

    provider.on("networkChanged", async (networkId: number) => {
      const library = new Web3Provider(provider);
      const network = await library.getNetwork();
      const chainId = network.chainId;

      await this.setState({ chainId, library });
    });

    provider.on("LogStateResult", async (args: any) => {
      await this.setState({ info: { message: `[func: submitElectionResult] ${args}` } });
    });
  };

  public async unSubscribe(provider: any) {
    // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
    window.location.reload(false);
    if (!provider.off) {
      return;
    }

    provider.off("accountsChanged", this.changedAccount);
    provider.off("networkChanged", this.networkChanged);
    provider.off("close", this.close);
  }

  public handleInputChange = async (event: any) => {
    const { name, value } = event.target;
    await this.setState({ form: { ...this.state.form, [name]: value } });
  }

  public changedAccount = async (accounts: string[]) => {
    if (!accounts.length) {
      // Metamask Lock fire an empty accounts array 
      await this.resetApp();
    } else {
      await this.setState({ address: accounts[0] });
    }
  }

  public networkChanged = async (networkId: number) => {
    const library = new Web3Provider(this.provider);
    const network = await library.getNetwork();
    const chainId = network.chainId;
    await this.setState({ chainId, library });
  }

  public close = async () => {
    this.resetApp();
  }

  public getNetwork = () => getChainData(this.state.chainId).network;

  public getProviderOptions = () => {
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: process.env.REACT_APP_INFURA_ID
        }
      }
    };
    return providerOptions;
  };

  public resetApp = async () => {
    await this.web3Modal.clearCachedProvider();
    localStorage.removeItem("WEB3_CONNECT_CACHED_PROVIDER");
    localStorage.removeItem("walletconnect");
    await this.unSubscribe(this.provider);

    this.setState({ ...INITIAL_STATE });

  };

  public render = () => {
    const {
      address,
      connected,
      chainId,
      fetching,
      seats,
      electionContract,
      hasEnded,
      info,
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.resetApp}
          />

          <SContent>
            {fetching ? (
              <Column center>
                <SContainer><Loader /></SContainer>
              </Column>
            ) : electionContract && connected ? (
              <SBalances>
                <h3>Contract Actions</h3>

                <Column center>

                  <STestButtonContainer>

                    <div className="container-fluid">

                      <div className="row">
                        <div className="col-4">
                          <Button onClick={this.resumeElection}>Resume Election</Button>
                        </div>
                        <div className="col-4">
                          <Button onClick={this.currentLeader}>Current Leader</Button>
                        </div>
                        <div className="col-4">
                          <Button onClick={this.endElection}>End Election</Button>
                        </div>
                      </div>

                      <div className="row text-left mb-5">
                        <div className="col-6">
                          <h4 className="py-4">Submit results</h4>

                          <form action="">
                            <div className="form-group mt-1">
                              <label className="form-label d-block">State name</label>
                              <input value={this.state.form.stateName} onChange={this.handleInputChange} className="form-control" type="text" name="stateName" />
                            </div>

                            <div className="form-group mt-1">
                              <label className="form-label d-block">Trump votes</label>
                              <input value={this.state.form.trump} onChange={this.handleInputChange} className="form-control" type="text" name="trump" />
                            </div>

                            <div className="form-group">
                              <label className="form-label d-block">Biden votes</label>
                              <input value={this.state.form.biden} onChange={this.handleInputChange} className="form-control" type="number" name="biden" />
                            </div>

                            <div className="form-group mt-1">
                              <label className="form-label d-block">Seats count</label>
                              <input value={this.state.form.seats} onChange={this.handleInputChange} className="form-control" type="text" name="seats" />
                            </div>

                            <div className="">
                              <FormButton onClick={this.submitElectionResult}>Submit Result</FormButton>
                            </div>
                          </form>
                        </div>

                        <div className="col-6">
                          <h4 className="py-4">Election info</h4>

                          <div style={{
                            height: "40%",
                            padding: "16px",
                            backgroundColor: "#e6f2ff"
                          }}>

                            {seats.trump !== null ? (
                              <h6>Seats for Trump: {seats.trump}</h6>
                            ) : null}

                            {seats.biden !== null ? (
                              <h6>Seats for Biden: {seats.biden}</h6>
                            ) : null}

                            {hasEnded ? (
                              <h6>Election ended!</h6>
                            ) : (
                              <h6>Ongoing election...</h6>
                            )}

                            {info !== null ? (
                              <div>
                                <a href={info.link} target="_blank">{info.message}</a>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                  </STestButtonContainer>
                </Column>
              </SBalances>
            ) : (
              <SLanding center>
                <ConnectButton onClick={this.onConnect} />
              </SLanding>
            )}
          </SContent>
        </Column>
      </SLayout>
    );
  };
}

export default App;
