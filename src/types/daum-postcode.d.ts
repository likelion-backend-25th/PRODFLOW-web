interface DaumPostcodeResult {
  zonecode: string;
  roadAddress: string;
  address: string;
}

interface DaumPostcodeOptions {
  oncomplete: (data: DaumPostcodeResult) => void;
}

interface DaumPostcodeInstance {
  open: () => void;
}

interface DaumPostcodeConstructor {
  new (options: DaumPostcodeOptions): DaumPostcodeInstance;
}

interface Window {
  daum?: {
    Postcode: DaumPostcodeConstructor;
  };
}
