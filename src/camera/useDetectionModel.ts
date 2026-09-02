import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { TensorflowModel, TensorflowModelDelegate, useTensorflowModel } from 'react-native-fast-tflite';

const PREFERRED: TensorflowModelDelegate = Platform.OS === 'android' ? 'android-gpu' : 'default';

/**
 * Loads the detection model on the GPU delegate, falling back to CPU if it
 * refuses the model.
 *
 * The fallback is not optional: these detection models carry a custom
 * postprocessing op that GPU delegates commonly decline, and a hard failure
 * there would mean no detection at all — strictly worse than running slower.
 */
export function useDetectionModel(source: number): {
  model: TensorflowModel | undefined;
  delegate: TensorflowModelDelegate;
  failed: boolean;
} {
  const [delegate, setDelegate] = useState<TensorflowModelDelegate>(PREFERRED);
  const plugin = useTensorflowModel(source, delegate);

  useEffect(() => {
    if (plugin.state === 'error' && delegate !== 'default') setDelegate('default');
  }, [plugin.state, delegate]);

  return {
    model: plugin.state === 'loaded' ? plugin.model : undefined,
    delegate,
    failed: plugin.state === 'error' && delegate === 'default',
  };
}
