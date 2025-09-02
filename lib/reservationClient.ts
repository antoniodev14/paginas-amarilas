// lib/reservationClient.ts
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const KEY = 'anon_res_token';

export async function getClientAnonToken(): Promise<string> {
  let t = await AsyncStorage.getItem(KEY);
  if (!t) {
    t = uuidv4();
    await AsyncStorage.setItem(KEY, t);
  }
  return t;
}
