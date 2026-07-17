import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { NewBillProvider } from '../context/NewBillContext';
import AssignFriendsScreen from '../screens/NewBill/AssignFriendsScreen';
import PickReceiptScreen from '../screens/NewBill/PickReceiptScreen';
import ReviewItemsScreen from '../screens/NewBill/ReviewItemsScreen';
import SummaryScreen from '../screens/NewBill/SummaryScreen';
import FriendsScreen from '../screens/FriendsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/ThemeContext';
import type { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { colors, scheme } = useTheme();

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <NewBillProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack.Navigator
          screenOptions={{
            headerTitleAlign: 'center',
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Split the Bill' }} />
          <Stack.Screen name="Friends" component={FriendsScreen} options={{ title: 'Friends' }} />
          <Stack.Screen name="Groups" component={GroupsScreen} options={{ title: 'Groups' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="PickReceipt" component={PickReceiptScreen} options={{ title: 'New Bill' }} />
          <Stack.Screen name="ReviewItems" component={ReviewItemsScreen} options={{ title: 'Review Items' }} />
          <Stack.Screen name="AssignFriends" component={AssignFriendsScreen} options={{ title: 'Assign Items' }} />
          <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Summary' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </NewBillProvider>
  );
}
