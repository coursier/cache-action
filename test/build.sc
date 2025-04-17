import mill._
import mill.scalalib._

object thing extends ScalaModule {
  def scalaVersion = "2.13.5"
  def ivyDeps = Agg(ivy"com.github.alexarchambault::case-app-cats:2.0.4")
}
