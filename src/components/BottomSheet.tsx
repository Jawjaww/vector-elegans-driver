import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SNAP_POINTS = {
  collapsed: -120,
  medium: -SCREEN_HEIGHT * 0.45,
  expanded: -SCREEN_HEIGHT + 100
};

interface BottomSheetProps {
  children: React.ReactNode;
  snapLevel?: 'collapsed' | 'medium' | 'expanded';
}

export const BottomSheet = ({ children, snapLevel = 'collapsed' }: BottomSheetProps) => {
  const translateY = useSharedValue(SNAP_POINTS.collapsed);
  const context = useSharedValue({ y: 0 });

  useEffect(() => {
    translateY.value = withSpring(SNAP_POINTS[snapLevel], { damping: 50 });
  }, [snapLevel]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      translateY.value = event.translationY + context.value.y;
      translateY.value = Math.max(translateY.value, SNAP_POINTS.expanded);
    })
    .onEnd(() => {
      const currentY = translateY.value;
      const distCollapsed = Math.abs(currentY - SNAP_POINTS.collapsed);
      const distMedium = Math.abs(currentY - SNAP_POINTS.medium);
      const distExpanded = Math.abs(currentY - SNAP_POINTS.expanded);
      
      let target = SNAP_POINTS.collapsed;
      if (distMedium < distCollapsed && distMedium < distExpanded) target = SNAP_POINTS.medium;
      if (distExpanded < distCollapsed && distExpanded < distMedium) target = SNAP_POINTS.expanded;
      
      translateY.value = withSpring(target, { damping: 50 });
    });

  const rBottomSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.bottomSheetContainer, rBottomSheetStyle]}>
        {/* Exact Gradient Copy from RootLayout (Login/Profile style) */}
        <LinearGradient
          colors={['#171717', '#262626']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.handleContainer}>
            <View style={styles.line} />
        </View>
        <View style={{ flex: 1 }}>
            {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  bottomSheetContainer: {
    height: SCREEN_HEIGHT,
    width: '100%',
    backgroundColor: '#171717', // Fallback color
    overflow: 'hidden', // Ensure gradient stays within rounded corners
    position: 'absolute',
    top: SCREEN_HEIGHT,
    borderRadius: 25,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  handleContainer: {
      paddingVertical: 10,
      width: '100%',
      alignItems: 'center',
      backgroundColor: 'transparent', 
      // Make touchable area larger
      height: 40,
  },
  line: {
    width: 75,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
});
