// note on window.msal usage. There is little point holding the object constructed by new Msal.UserAgentApplication
// as the constructor for this class will make callbacks to the acquireToken function and these occur before
// any local assignment can take place. Not nice but its how it works.
import * as Msal from 'msal';
import React from 'react';

const logger = new Msal.Logger(loggerCallback, {
	level: Msal.LogLevel.Warning,
});
const state = {
	noScopes: false,
	launchApp: null,
	idToken: null,
	accessToken: null,
	userName: '',
};
var appConfig = {
	// optional, will default to 'https://login.microsoftonline.com/tfp/'
	instance: null,
	// your B2C tenant
	tenant: null,
	// the policy to use to sign in, can also be a sign up or sign in policy
	signInPolicy: null,
	// the policy to use for password reset
	resetPolicy: null,
	// the the B2C application you want to authenticate with
	applicationId: null,
	// where MSAL will store state - localStorage or sessionStorage
	cacheLocation: null,
	// optional, the scopes you want included in the access token
	scopes: [],
	// optional, the redirect URI - if not specified MSAL will pick up the location from window.href
	redirectUri: null,
	// optional, the URI to redirect to after logout
	postLogoutRedirectUri: null,
	// optional, default to true, set to false if you change instance
	validateAuthority: null,
	// optional, default to false, set to true if you want to acquire token silently and avoid redirections to login page
	silentLoginOnly: false,
};

function loggerCallback(logLevel, message, piiLoggingEnabled) {
	console.log(message);
}

function authCallback(errorDesc, token, error, tokenType) {
	if (errorDesc && errorDesc.indexOf('AADB2C90118') > -1) {
		redirect();
	} else if (errorDesc) {
		console.log(error + ':' + errorDesc);
	} else {
	}
}

function redirect() {
	const localMsalApp = window.msal;
	const instance = appConfig.instance
		? appConfig.instance
		: 'https://login.microsoftonline.com/tfp/';
	const authority = `${instance}${appConfig.tenant}/${appConfig.resetPolicy}`;
	localMsalApp.authority = authority;
	loginAndAcquireToken();
}

function loginAndAcquireToken(successCallback) {
	const localMsalApp = window.msal;
	const scopes = [...appConfig.scopes, 'openid', 'profile'];
	let account = localMsalApp.getAccount();

	console.log('account', account);
	console.log('appConfig', appConfig);
	console.log('scopes', scopes);

	if (!account) {
		// account is not logged in
		if (state.noScopes) {
			// no need of access token
			if (appConfig.silentLoginOnly) {
				// on silent mode we call error app
				if (state.errorApp) state.errorApp();
			}
			// just redirect to login page
			else
				localMsalApp.loginRedirect({
					scopes: scopes,
				});
		} else {
			// try to get token from SSO session
			localMsalApp
				.acquireTokenSilent({
					scopes: scopes,
				})
				.then(
					(accessToken) => {
						console.log('accessToken', accessToken);
						state.accessToken = accessToken;
						account = localMsalApp.getAccount();
						state.idToken = account.idToken;
						state.userName = account.name;
						if (state.launchApp) {
							state.launchApp();
						}
						if (successCallback) {
							successCallback();
						}
					},
					(error) => {
						if (error) {
							if (appConfig.silentLoginOnly) state.errorApp();
							else
								localMsalApp.loginRedirect({
									scopes: scopes,
								});
						}
					}
				);
		}
	} else {
		// the user is already logged in
		state.idToken = account.idToken;
		state.userName = account.name;
		if (state.noScopes) {
			// no need of access token, just launch the app
			if (state.launchApp) {
				state.launchApp();
			}
			if (successCallback) {
				successCallback();
			}
		} else {
			// get access token
			localMsalApp
				.acquireTokenSilent({
					scopes: scopes,
				})
				.then(
					(accessToken) => {
						state.accessToken = accessToken;
						if (state.launchApp) {
							state.launchApp();
						}
						if (successCallback) {
							successCallback();
						}
					},
					(error) => {
						if (error) {
							localMsalApp.loginRedirect({
								scopes: scopes,
							});
						}
					}
				);
		}
	}
}

const authentication = {
	msalApp: null,
	initialize: (config) => {
		appConfig = config;
		const instance = config.instance
			? config.instance
			: 'https://login.microsoftonline.com/tfp/';
		const authority = `https://${instance}/${config.tenant}/${config.signInPolicy}`;
		let scopes = config.scopes;
		if (!scopes || scopes.length === 0) {
			console.log(
				'To obtain access tokens you must specify one or more scopes. See https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-access-tokens'
			);
			state.noScopes = true;
		}
		state.scopes = [...scopes, 'openid', 'profile'];

		const msalConfig = {
			auth: {
				clientId: config.applicationId,
				authority: authority,
				knownAuthorities: [instance],
				cloudDiscoveryMetadata: '',
				redirectUri: config.redirectUri,
				postLogoutRedirectUri: config.postLogoutRedirectUri,
				navigateToLoginRequestUrl: true,
				clientCapabilities: ['CP1'],
			},
			cache: {
				cacheLocation: config.cacheLocation,
				storeAuthStateInCookie: false,
			},
			system: {
				logger: logger,
				windowHashTimeout: 60000,
				iframeHashTimeout: 6000,
				loadFrameTimeout: 0,
				asyncPopups: false,
			},
		};

		authentication.msalApp = new Msal.UserAgentApplication(msalConfig);
	},
	run: (launchApp, errorApp) => {
		console.log('window.msal', window.msal);
		state.launchApp = launchApp;
		if (errorApp) state.errorApp = errorApp;
		if (
			!window.msal.isCallback(window.location.hash) &&
			window.parent === window &&
			!window.opener
		) {
			loginAndAcquireToken();
		}
	},
	required: (WrappedComponent, renderLoading) => {
		return class extends React.Component {
			constructor(props) {
				super(props);
				this.state = {
					signedIn: false,
					error: null,
				};
			}

			componentWillMount() {
				loginAndAcquireToken(() => {
					this.setState({
						...this.state,
						signedIn: true,
					});
				});
			}

			render() {
				if (this.state.signedIn) {
					return <WrappedComponent {...this.props} />;
				}
				return typeof renderLoading === 'function' ? renderLoading() : null;
			}
		};
	},
	signOut: () => {
		window.msal.logout();
	},
	getIdToken: () => {
		return state.idToken;
	},
	getAccessToken: () => {
		return state.accessToken;
	},
	getUserName: () => {
		return state.userName;
	},
};

export default authentication;
