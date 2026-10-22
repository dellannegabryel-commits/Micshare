import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { DiscoveryScreen } from './DiscoveryScreen';
import { AudioScreen } from './AudioScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#0a0a0a' },
        }}
      >
        <Stack.Screen name="Discovery" component={DiscoveryScreen} />
        <Stack.Screen name="Audio" component={AudioScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}