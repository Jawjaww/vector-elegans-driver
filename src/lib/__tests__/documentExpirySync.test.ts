import type { TFunction } from 'i18next';
import {
  formatDocumentExpiryRpcError,
  syncUploadedDocumentExpiries,
} from '../documentExpirySync';
import { updateOwnDocumentExpiry } from '../services/documentService';

jest.mock('../services/documentService', () => ({
  updateOwnDocumentExpiry: jest.fn(),
}));

jest.mock('../../components/AppDialog', () => ({
  showAppAlert: jest.fn(),
}));

const mockUpdate = updateOwnDocumentExpiry as jest.MockedFunction<
  typeof updateOwnDocumentExpiry
>;

const t = ((key: string) => key) as TFunction;

const baseInput = {
  formData: {
    driving_license_expiry_date: '2031-06-15',
    vtc_card_expiry_date: '',
    license_number: '',
    first_name: '',
    last_name: '',
    phone: '',
    date_of_birth: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    vtc_card_number: '',
    insurance_number: '',
    company_siret: '',
    address: '',
    city: '',
    postal_code: '',
    license_plate: '',
  },
  documents: {
    driving_license: 'path/license.jpeg',
    vtc_card: null,
    insurance: null,
    id_card: null,
    proof_of_address: null,
  },
  documentMeta: {
    driving_license: {
      status: 'approved',
      rejectionReason: null,
      expiryDate: '2030-06-30',
    },
  },
  missingForSubmit: [],
};

describe('formatDocumentExpiryRpcError', () => {
  it('maps pending_review guard to French key', () => {
    expect(
      formatDocumentExpiryRpcError(
        t,
        'can only update expiry on rejected documents while pending_review',
      ),
    ).toBe('documents.expiryLockedPendingReview');
  });
});

describe('syncUploadedDocumentExpiries', () => {
  // DriverProfileSetup nextSection (Profil → Pro) calls persistDriverRow only.
  // This helper must never run on that path.
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ success: true });
  });

  it('skips RPC calls in locked mode', async () => {
    const ok = await syncUploadedDocumentExpiries(t, 'driver-1', baseInput, {
      editMode: 'locked',
    });
    expect(ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips non-rejected documents in rejected_only mode', async () => {
    const ok = await syncUploadedDocumentExpiries(t, 'driver-1', baseInput, {
      editMode: 'rejected_only',
      rejectedDocumentTypes: ['vtc_card'],
    });
    expect(ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('calls RPC for rejected documents in rejected_only mode', async () => {
    const input = {
      ...baseInput,
      documentMeta: {
        driving_license: {
          status: 'rejected',
          rejectionReason: 'blur',
          expiryDate: '2030-06-30',
        },
      },
    };
    const ok = await syncUploadedDocumentExpiries(t, 'driver-1', input, {
      editMode: 'rejected_only',
      rejectedDocumentTypes: ['driving_license'],
    });
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      'driver-1',
      'driving_license',
      '2031-06-15',
    );
  });

  it('skips RPC when server expiry already matches', async () => {
    const input = {
      ...baseInput,
      formData: {
        ...baseInput.formData,
        driving_license_expiry_date: '2030-06-30',
      },
    };
    const ok = await syncUploadedDocumentExpiries(t, 'driver-1', input, {
      editMode: 'full',
    });
    expect(ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
