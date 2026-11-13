import { router } from '@kit.ArkUI';
import { Banner } from './Banner';

@Component
export struct TopBar {
  @Prop title: string = '';
  @Prop showBack: boolean = true;

  build() {
    Column() {
      Banner()
      Row() {
        if (this.showBack) {
          Text('返回')
            .fontSize(16)
            .fontColor('#0B6E4F')
            .onClick(() => {
              router.back();
            })
        }
        Text(this.title)
          .fontSize(20)
          .fontWeight(FontWeight.Medium)
          .fontColor('#1C2B26')
          .margin({ left: this.showBack ? 12 : 0 })
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 4, bottom: 10 })
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .backgroundColor('#FFFFFF')
    .alignItems(HorizontalAlign.Start)
  }
}
