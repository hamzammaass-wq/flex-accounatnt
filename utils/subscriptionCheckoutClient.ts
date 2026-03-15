import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../firebaseClient';
import { SubscriptionBillingCycle } from '../types';

type StripeCheckoutResponse = {
  sessionId?: string;
  url?: string;
};

export const createStripeWorkspaceCheckoutSession = async (input: {
  billingCycle: SubscriptionBillingCycle;
  desiredCompanyCount: number;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<StripeCheckoutResponse> => {
  if (!firebaseFunctions) {
    throw new Error('Firebase Functions is not configured for this project.');
  }

  const callable = httpsCallable<
    {
      billingCycle: SubscriptionBillingCycle;
      desiredCompanyCount: number;
      successUrl?: string;
      cancelUrl?: string;
    },
    StripeCheckoutResponse
  >(firebaseFunctions, 'createStripeWorkspaceCheckout');

  const response = await callable(input);
  return response.data || {};
};
