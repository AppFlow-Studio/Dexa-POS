import { useNavigation } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "~/components/ui/menubar";
import { Text } from "~/components/ui/text";

export default function MenuBar() {
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };
  const [value, setValue] = React.useState<string | undefined>();
  const [isSubOpen, setIsSubOpen] = React.useState(false);
  const [isSubOpen2, setIsSubOpen2] = React.useState(false);
  const [isChecked, setIsChecked] = React.useState(false);
  const [isChecked2, setIsChecked2] = React.useState(false);
  const [radio, setRadio] = React.useState("michael");
  const navigation = useNavigation();
  React.useEffect(() => {
    const sub = navigation.addListener("blur", () => {
      onValueChange(undefined);
    });

    return sub;
  }, []);

  function closeSubs() {
    setIsSubOpen(false);
    setIsSubOpen2(false);
  }

  function onValueChange(val: string | undefined) {
    if (typeof val === "string") {
      setValue(val);
      return;
    }
    closeSubs();
    setValue(undefined);
  }

  return (
    <View className="flex-1 items-center p-4">
      {!!value && (
        <Pressable
          onPress={() => {
            onValueChange(undefined);
          }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Menubar value={value} onValueChange={onValueChange}>
        <MenubarMenu value="file">
          <MenubarTrigger onPress={closeSubs}>
            <Text className="text-2xl">File</Text>
          </MenubarTrigger>
          <MenubarContent insets={contentInsets}>
            <MenubarItem>
              <Text className="text-2xl">New Tab</Text>
              <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              <Text className="text-2xl">New Window</Text>
              <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              <Text className="text-2xl">New Incognito Window</Text>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub open={isSubOpen} onOpenChange={setIsSubOpen}>
              <MenubarSubTrigger>
                <Text className="text-2xl">Share</Text>
              </MenubarSubTrigger>
              <MenubarSubContent>
                <Animated.View entering={FadeIn.duration(200)}>
                  <MenubarItem>
                    <Text className="text-2xl">Email link</Text>
                  </MenubarItem>
                  <MenubarItem>
                    <Text className="text-2xl">Messages</Text>
                  </MenubarItem>
                  <MenubarItem>
                    <Text className="text-2xl">Notes</Text>
                  </MenubarItem>
                </Animated.View>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem>
              <Text className="text-2xl">Print...</Text>
              <MenubarShortcut>⌘P</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="edit">
          <MenubarTrigger onPress={closeSubs}>
            <Text className="text-2xl">Edit</Text>
          </MenubarTrigger>
          <MenubarContent insets={contentInsets} className="native:w-48">
            <MenubarItem>
              <Text className="text-2xl">Undo</Text>
              <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              <Text className="text-2xl">Redo</Text>
              <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub open={isSubOpen2} onOpenChange={setIsSubOpen2}>
              <MenubarSubTrigger>
                <Text className="text-2xl">Find</Text>
              </MenubarSubTrigger>
              <MenubarSubContent>
                <Animated.View entering={FadeIn.duration(200)}>
                  <MenubarItem>
                    <Text className="text-2xl">Search the web</Text>
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>
                    <Text className="text-2xl">Find...</Text>
                  </MenubarItem>
                  <MenubarItem>
                    <Text className="text-2xl">Find Next</Text>
                  </MenubarItem>
                  <MenubarItem>
                    <Text className="text-2xl">Find Previous</Text>
                  </MenubarItem>
                </Animated.View>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem>
              <Text className="text-2xl">Cut</Text>
            </MenubarItem>
            <MenubarItem>
              <Text className="text-2xl">Copy</Text>
            </MenubarItem>
            <MenubarItem>
              <Text className="text-2xl">Paste</Text>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="view">
          <MenubarTrigger onPress={closeSubs}>
            <Text className="text-2xl">View</Text>
          </MenubarTrigger>
          <MenubarContent insets={contentInsets}>
            <MenubarCheckboxItem
              checked={isChecked}
              onCheckedChange={setIsChecked}
              closeOnPress={false}
            >
              <Text className="text-2xl">Always Show Bookmarks Bar</Text>
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={isChecked2}
              onCheckedChange={setIsChecked2}
              closeOnPress={false}
            >
              <Text className="text-2xl">Always Show Full URLs</Text>
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem inset>
              <Text className="text-2xl">Reload</Text>
              <MenubarShortcut>⌘R</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled inset>
              <Text className="text-2xl">Force Reload</Text>
              <MenubarShortcut>⇧⌘R</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem inset>
              <Text className="text-2xl">Toggle Fullscreen</Text>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem inset>
              <Text className="text-2xl">Hide Sidebar</Text>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="profile">
          <MenubarTrigger onPress={closeSubs}>
            <Text className="text-2xl">Profiles</Text>
          </MenubarTrigger>
          <MenubarContent insets={contentInsets}>
            <MenubarRadioGroup value={radio} onValueChange={setRadio}>
              <MenubarRadioItem closeOnPress={false} value="andy">
                <Text className="text-2xl">Andy</Text>
              </MenubarRadioItem>
              <MenubarRadioItem closeOnPress={false} value="michael">
                <Text className="text-2xl">Michael</Text>
              </MenubarRadioItem>
              <MenubarRadioItem closeOnPress={false} value="creed">
                <Text className="text-2xl">Creed</Text>
              </MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarItem inset>
              <Text className="text-2xl">Edit...</Text>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem inset>
              <Text className="text-2xl">Add Profile...</Text>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </View>
  );
}
